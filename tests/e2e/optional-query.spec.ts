import { expect, test } from "@playwright/test";
import {
  subscribeToOptionalQuery,
  type OptionalQueryWatch,
} from "../../src/optionalQuery";

test("an unavailable optional backend query cannot crash the app", () => {
  let notify = () => {};
  let unsubscribeCalls = 0;
  let result: string[] | undefined;
  let error: Error | undefined = new Error("Function not found");
  const values: Array<string[] | undefined> = [];
  const watch: OptionalQueryWatch<string[]> = {
    localQueryResult: () => {
      if (error) throw error;
      return result;
    },
    onUpdate: (callback) => {
      notify = callback;
      return () => {
        unsubscribeCalls += 1;
      };
    },
  };

  const unsubscribe = subscribeToOptionalQuery(watch, (value) => {
    values.push(value);
  });
  expect(values).toEqual([undefined]);

  error = undefined;
  result = ["complete"];
  notify();
  expect(values).toEqual([undefined, ["complete"]]);

  error = new Error("Backend unavailable");
  notify();
  expect(values).toEqual([undefined, ["complete"], undefined]);

  unsubscribe();
  notify();
  expect(values).toEqual([undefined, ["complete"], undefined]);
  expect(unsubscribeCalls).toBe(1);
});
