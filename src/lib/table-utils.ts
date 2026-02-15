export const typeColors: Record<string, string> = {
  maintenance: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  repair: "bg-red-500/10 text-red-500 border-red-500/20",
  upgrade: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  inspection: "bg-amber-500/10 text-amber-500 border-amber-500/20",
};

export const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  "in-progress": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "waiting-parts": "bg-orange-500/10 text-orange-500 border-orange-500/20",
  ready: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};
