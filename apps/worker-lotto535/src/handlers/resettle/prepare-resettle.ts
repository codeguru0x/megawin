import {
  PrepareResettleUseCase,
  type PrepareResettleInput,
} from "@megawin/game-lotto535-application/use-cases/resettle";

const useCase = new PrepareResettleUseCase();

export async function handler(event: PrepareResettleInput) {
  return useCase.run(event);
}
