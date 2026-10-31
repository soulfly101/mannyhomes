/** Whole Ghana cedis shown the house way: "GH₵ 1,200". */
export const formatCedis = (amount: number) => `GH₵ ${Math.round(amount).toLocaleString("en-GH")}`;
