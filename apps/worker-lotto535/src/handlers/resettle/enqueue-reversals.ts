import {
  EnqueueReversalsUseCase,
  type EnqueueReversalsInput,
} from "@megawin/game-lotto535-application/use-cases/resettle";

const useCase = new EnqueueReversalsUseCase();

export async function handler(event: EnqueueReversalsInput) {
  return useCase.run(event);
}
