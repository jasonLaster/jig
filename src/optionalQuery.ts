export type OptionalQueryWatch<T> = {
  localQueryResult: () => T | undefined;
  onUpdate: (callback: () => void) => () => void;
};

export function subscribeToOptionalQuery<T>(
  watch: OptionalQueryWatch<T>,
  onValue: (value: T | undefined) => void,
) {
  let active = true;
  const update = () => {
    if (!active) return;
    try {
      onValue(watch.localQueryResult());
    } catch {
      onValue(undefined);
    }
  };
  const unsubscribe = watch.onUpdate(update);
  update();
  return () => {
    active = false;
    unsubscribe();
  };
}
