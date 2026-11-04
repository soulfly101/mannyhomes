import { formatCedis, initials } from "../src/format";

test.each([
  [0, "GH₵ 0"],
  [200, "GH₵ 200"],
  [1200, "GH₵ 1,200"],
  [1250000, "GH₵ 1,250,000"],
  [99.6, "GH₵ 100"],
])("%d is shown as %s", (amount, expected) => {
  expect(formatCedis(amount)).toBe(expected);
});

test.each([
  ["Ama Mensah", "AM"],
  ["Kofi Ama Mensah", "KM"],
  ["Ama", "A"],
  ["  ama   mensah  ", "AM"],
  ["", ""],
])("the initials of %j are %j", (name, expected) => {
  expect(initials(name)).toBe(expected);
});
