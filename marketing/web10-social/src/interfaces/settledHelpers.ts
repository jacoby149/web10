export const onlySettled = async <T,>(
  promises: Promise<T>[]
): Promise<T[]> => {
  const results = await Promise.allSettled(promises);
  const fulfilled: T[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') fulfilled.push(r.value);
  }
  return fulfilled;
};

export const sortSettled = <T,>(
  responseDatas: T[] | T[][],
  key: string = 'time',
  direction: number = 1
): T[] => {
  const flat = Array.isArray(responseDatas[0]) ? (responseDatas as T[][]).flat() : (responseDatas as T[]);
  return [...flat].sort((a, b) => {
    const timeA = new Date((a as Record<string, unknown>)[key] as string).getTime();
    const timeB = new Date((b as Record<string, unknown>)[key] as string).getTime();
    return (timeB - timeA) * direction;
  });
};
