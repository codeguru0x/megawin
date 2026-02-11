/**
 * Entrypoint cho Lambda HTTP (API Gateway) trong app-core.
 * Giúp import ngắn gọn, rõ ràng:
 *
 * import {
 *   ApiGatewayUseCase,
 *   AuthorizedApiGatewayUseCase,
 * } from "@megawin/app-core/lambda/http";
 */

export {
  type ApiGatewayParsedInput,
  type ApiGatewayParsedInputWithAuthorizer,
  type ApiGatewayEventWithValidated,
  type ApiGatewayResponse,
  parseApiGatewayBody,
  parseApiGatewayEventToInput,
  useCaseErrorToStatusCode,
  toApiGatewayResponse,
  ApiGatewayUseCase,
  AuthorizedApiGatewayUseCase,
} from "./usecase-api-gateway";

export {
  getAuthContextFromApiGatewayEvent,
  checkAuthorization,
  type AuthContext,
  type AuthRequirements,
  type AuthScope,
  type AuthContextAdapterOptions,
  type ApiGatewayEventWithAuthorizer,
} from "./authorization-api-gateway";
