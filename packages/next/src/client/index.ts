/**
 * React Query factory helpers – tạo query/mutation functions từ ApiClient.
 *
 * Giúp giảm boilerplate khi dùng React Query với ApiClient.
 * Tất cả đều type-safe và tự động handle error qua ApiClientError.
 *
 * @example
 * // Định nghĩa API functions
 * const usersApi = {
 *   list: (params?: ListParams) => apiClient.get<User[]>("/users", { params }),
 *   get: (id: string) => apiClient.get<User>(`/users/${id}`),
 *   create: (data: CreateUserDto) => apiClient.post<User>("/users", data),
 *   update: (id: string, data: UpdateUserDto) => apiClient.put<User>(`/users/${id}`, data),
 *   delete: (id: string) => apiClient.delete(`/users/${id}`),
 * };
 *
 * // React components
 * function UserList() {
 *   const { data, error } = useQuery({
 *     queryKey: ["users"],
 *     queryFn: () => usersApi.list(),
 *   });
 *
 *   if (error instanceof ApiClientError) {
 *     // Full type-safe error access
 *     console.log(error.status, error.code, error.message);
 *   }
 * }
 */

"use client";

export { ApiClientError } from "../types";
export {
  createApiClient,
  apiClient,
  type ApiClient,
  type ApiClientConfig,
  type RequestOptions,
} from "./api-client";
