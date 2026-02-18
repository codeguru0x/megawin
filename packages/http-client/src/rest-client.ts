import axios from "axios";
import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
  AxiosError,
} from "axios";

const DEFAULT_BASE_URL = "https://localhost:3000/";

export interface Interceptors {
  request?: {
    onFulfilled?: (
      config: InternalAxiosRequestConfig
    ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;
    onRejected?: (error: AxiosError) => unknown;
  };
  response?: {
    onFulfilled?: (
      response: AxiosResponse
    ) => AxiosResponse | Promise<AxiosResponse>;
    onRejected?: (error: AxiosError) => unknown;
  };
}

export interface RestClientConfig extends AxiosRequestConfig {
  interceptors?: Interceptors;
}

export function createRestClient(config?: RestClientConfig): AxiosInstance {
  const { interceptors, ...axiosConfig } = config ?? {};

  const instance = axios.create({
    baseURL: DEFAULT_BASE_URL,
    timeout: 30_000,
    ...axiosConfig,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...axiosConfig.headers,
    },
  });

  if (interceptors?.request) {
    instance.interceptors.request.use(
      interceptors.request.onFulfilled,
      interceptors.request.onRejected
    );
  }

  if (interceptors?.response) {
    instance.interceptors.response.use(
      interceptors.response.onFulfilled,
      interceptors.response.onRejected
    );
  }

  return instance;
}

const restClient = createRestClient();

export { restClient };
export type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
  AxiosError,
};
