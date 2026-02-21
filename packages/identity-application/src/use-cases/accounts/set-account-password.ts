import { NextApiUseCase } from "@megawin/next/server";
import {
  adminSetUserPassword,
  COGNITO_WORKFORCE_POOL_ID,
} from "@megawin/app-core/aws/cognito";

export interface SetAccountPasswordInput {
  username: string;
  password: string;
}

export interface SetAccountPasswordOutput {
  username: string;
}

export class SetAccountPasswordUseCase extends NextApiUseCase<
  SetAccountPasswordInput,
  SetAccountPasswordOutput
> {
  protected async execute(
    input: SetAccountPasswordInput
  ): Promise<SetAccountPasswordOutput> {
    await adminSetUserPassword({
      userPoolId: COGNITO_WORKFORCE_POOL_ID!,
      username: input.username,
      password: input.password,
      permanent: false,
    });

    return { username: input.username };
  }
}
