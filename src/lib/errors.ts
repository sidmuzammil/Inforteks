export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "INVALID_REQUEST",
  ) {
    super(message);
  }
}
export function invariant(
  value: unknown,
  status: number,
  message: string,
  code?: string,
): asserts value {
  if (!value) throw new AppError(status, message, code);
}
