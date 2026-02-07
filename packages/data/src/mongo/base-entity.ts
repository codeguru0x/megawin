/**
 * Base entity interface
 * Định nghĩa các field cơ bản của một entity
 * @example
 * const user: BaseEntity = {
 *   id: "123",
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 *   createdBy: "John Doe",
 *   updatedBy: "Jane Doe",
 * };
 */
export interface BaseEntity {
  /**
   * Id of the entity
   * Map to _id in MongoDB
   */
  id: string;
}
