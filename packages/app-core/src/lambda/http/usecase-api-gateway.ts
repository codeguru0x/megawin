/**
 * Use case cho API Gateway (Lambda proxy).
 * Input: body + path/query/headers. Output: statusCode, body, headers.
 *
 * Middy là tùy chọn: có thể validate request bằng Zod ngay trong use case (validate())
 * và xử lý lỗi qua UseCaseResult + toApiGatewayResponse, không cần middleware.
 * Khi dùng Middy, event.validated (từ validatorZodMiddleware) được ưu tiên trong parseInput.
 */

import {
  BaseUseCase,
  UseCaseResult,
  UseCaseErrorCode,
  UseCaseError,
  USE_CASE_ERROR_CODES,
} from "#application/usecase/usecase-base";

import {
  getAuthContextFromApiGatewayEvent,
  checkAuthorization,
  type AuthRequirements,
  type AuthContext,
  type AuthContextAdapterOptions,
  type ApiGatewayEventWithAuthorizer,
} from "./authorization-api-gateway";

// ============ Types ============

/** Input từ API Gateway (body + path/query/headers). */
export interface ApiGatewayParsedInput<T = unknown> {
  body: T;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  headers?: Record<string, string>;
}

/** Input API Gateway có thêm auth context từ Authorizer (Cognito). Dùng với AuthorizedApiGatewayUseCase. */
export interface ApiGatewayParsedInputWithAuthorizer<
  TBody = unknown,
> extends ApiGatewayParsedInput<TBody> {
  /** Null khi access = public và không có token. */
  auth: AuthContext | null;
}

/**
 * Event API Gateway. validated chỉ có khi dùng Middy (validatorZodMiddleware);
 * parseInput ưu tiên event.validated nếu có, không thì parse body JSON.
 */
export interface ApiGatewayEventWithValidated<TBody = unknown> {
  body?: string;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  headers?: Record<string, string>;
  /** Chỉ có khi dùng Middy + validatorZodMiddleware. */
  validated?: {
    body?: TBody;
    pathParameters?: Record<string, string>;
    queryStringParameters?: Record<string, string>;
  };
}

/** Response chuẩn API Gateway (Lambda proxy). */
export interface ApiGatewayResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

// ============ Helpers ============

/** Parse body JSON từ API Gateway event. Throw UseCaseError nếu thiếu/invalid. */
export function parseApiGatewayBody<T>(body: string | null | undefined): T {
  if (body == null || body === "") {
    throw {
      code: USE_CASE_ERROR_CODES.VALIDATION,
      message: "Missing body",
    } satisfies UseCaseError;
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw {
      code: USE_CASE_ERROR_CODES.VALIDATION,
      message: "Invalid JSON body",
    } satisfies UseCaseError;
  }
}

/** Map UseCaseErrorCode → HTTP status. */
export function useCaseErrorToStatusCode(code: UseCaseErrorCode): number {
  switch (code) {
    case "VALIDATION":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    default:
      return 500;
  }
}

/**
 * Chuyển UseCaseResult<O> thành response API Gateway.
 * Dùng trong Lambda handler sau khi gọi useCase.run(event).
 */
export function toApiGatewayResponse<O>(
  result: UseCaseResult<O>,
  options?: {
    serialize?: (data: O) => string;
    headers?: Record<string, string>;
  }
): ApiGatewayResponse {
  const defaultHeaders = { "Content-Type": "application/json" };
  const headers = { ...defaultHeaders, ...options?.headers };

  if (result.success) {
    const body =
      options?.serialize != null
        ? options.serialize(result.data)
        : JSON.stringify(result.data);

    // Return 200 OK
    return { statusCode: 200, body, headers };
  }

  // Return error response
  return {
    statusCode: useCaseErrorToStatusCode(result.error.code),
    body: JSON.stringify({ error: result.error }),
    headers,
  };
}

/**
 * Parse event API Gateway thành ApiGatewayParsedInput (body, path, query, headers).
 * Dùng khi không qua Middy hoặc khi cần build input có thêm user (auth).
 */
export function parseApiGatewayEventToInput<I>(
  event: ApiGatewayEventWithValidated<I>
): ApiGatewayParsedInput<I> {
  const e = event;
  const body =
    e.validated?.body !== undefined
      ? e.validated.body
      : parseApiGatewayBody<I>(e.body);
  return {
    body,
    pathParameters: e.validated?.pathParameters ?? e.pathParameters,
    queryStringParameters:
      e.validated?.queryStringParameters ?? e.queryStringParameters,
    headers: e.headers,
  };
}

// ============ ApiGatewayUseCase ============

/**
 * Use case chạy từ API Gateway event.
 * parseInput: ưu tiên event.validated (Middy + Zod), không có thì parse body JSON.
 * runFromEvent(): chạy và trả về ApiGatewayResponse.
 */
export abstract class ApiGatewayUseCase<I, O> extends BaseUseCase<
  ApiGatewayParsedInput<I>,
  O
> {
  protected parseInput(raw: unknown): ApiGatewayParsedInput<I> {
    return parseApiGatewayEventToInput<I>(
      raw as ApiGatewayEventWithValidated<I>
    );
  }

  /** Chạy từ event API Gateway và trả về response. */
  async runFromEvent(
    event: unknown,
    options?: { serialize?: (data: O) => string }
  ): Promise<ApiGatewayResponse> {
    const result = await this.run(event);
    return toApiGatewayResponse(result, options);
  }
}

// ============ AuthorizedApiGatewayUseCase (sau Cognito Authorizer) ============

/**
 * Use case API Gateway có authorization (sau Cognito / Lambda Authorizer).
 * Không verify token – chỉ check: public/authed, scope (internal | player | agent), roles.
 * execute() nhận input.auth (AuthContext | null) để dùng tenantId, roles, v.v.
 */
export abstract class AuthorizedApiGatewayUseCase<I, O> extends BaseUseCase<
  ApiGatewayParsedInputWithAuthorizer<I>,
  O
> {
  constructor(
    protected authRequirements: AuthRequirements,
    protected authAdapterOptions?: AuthContextAdapterOptions
  ) {
    super();
  }

  protected parseInput(_raw: unknown): ApiGatewayParsedInputWithAuthorizer<I> {
    throw new Error("Use run() or runFromEvent(); parseInput is not used.");
  }

  override async run(raw: unknown): Promise<UseCaseResult<O>> {
    const event = raw as ApiGatewayEventWithValidated<I> &
      ApiGatewayEventWithAuthorizer;
    try {
      const auth = getAuthContextFromApiGatewayEvent(
        event,
        this.authAdapterOptions
      );
      const authError = checkAuthorization(auth, this.authRequirements);
      if (authError) {
        return { success: false, error: authError };
      }
      const parsed = parseApiGatewayEventToInput(event);
      const input: ApiGatewayParsedInputWithAuthorizer<I> = {
        ...parsed,
        auth: auth ?? null,
      };
      const validationError = this.validate(input);
      if (validationError) {
        return { success: false, error: validationError };
      }
      const output = await this.execute(input);
      return { success: true, data: output };
    } catch (err) {
      return this.handleError(err);
    }
  }

  async runFromEvent(
    event: unknown,
    options?: { serialize?: (data: O) => string }
  ): Promise<ApiGatewayResponse> {
    const result = await this.run(event);
    return toApiGatewayResponse(result, options);
  }
}
