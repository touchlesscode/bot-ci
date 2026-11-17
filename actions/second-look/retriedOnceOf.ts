/** `attempt`'s result, trying it a second time when the first throws (`onRetry` hears why); the second failure is thrown */
export const retriedOnceOf = async <T>(attempt: () => Promise<T>, onRetry: (failure: Error) => void = () => {}): Promise<T> => {
  try {
    return await attempt()
  } catch (error) {
    onRetry(error as Error)
    return attempt()
  }
}
