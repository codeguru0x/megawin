/**
 * Barrel re-export cho backward-compat. Ưu tiên import thẳng từ subdirectory:
 *
 * ```tsx
 * import { ... } from "@/components/reports/game/settle";
 * import { ... } from "@/components/reports/game/outstanding"; // tương lai
 * import { ... } from "@/components/reports/game/void";        // tương lai
 * ```
 */

export * from "./outstanding";
export * from "./settle";
export * from "./void";
