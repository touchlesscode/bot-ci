/** line numbers as short ranges: [3, 5, 6, 7] → "3, 5-7" */
export const lineRangesOf = (lines: number[]) =>
  [...new Set(lines)]
    .sort((left, right) => left - right)
    .reduce<[number, number][]>((ranges, line) => {
      const last = ranges.at(-1)
      if (last && line === last[1] + 1) last[1] = line
      else ranges.push([line, line])
      return ranges
    }, [])
    .map(([start, end]) => (start === end ? String(start) : `${start}-${end}`))
    .join(", ")
