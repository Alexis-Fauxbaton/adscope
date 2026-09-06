// `chrome.storage.local` de fabrique : la vraie retient un quota et lève quand
// il est dépassé, c'est précisément le comportement qu'il faut pouvoir jouer.
// `gets` retient les lectures pour vérifier qu'une page n'en fait qu'une.
export const storage = ({ quota = Infinity, entries = {} } = {}) => {
  const data = { ...entries }
  const state = { quota }
  const gets = []
  const writes = []
  const weigh = (o) =>
    Object.entries(o).reduce((n, [k, v]) => n + k.length + JSON.stringify(v).length, 0)

  const local = {
    QUOTA_BYTES: 10485760,
    get: async (keys) => {
      gets.push(keys)
      if (keys == null) return { ...data }
      const out = {}
      for (const k of [].concat(keys)) if (k in data) out[k] = data[k]
      return out
    },
    set: async (items) => {
      writes.push(Object.keys(items))
      if (weigh({ ...data, ...items }) > state.quota) throw new Error('QUOTA_BYTES quota exceeded')
      Object.assign(data, items)
    },
    remove: async (keys) => {
      for (const k of [].concat(keys)) delete data[k]
    },
    getBytesInUse: async () => weigh(data),
  }
  // Le quota se resserre après coup : les tests remplissent d'abord, puis
  // rabaissent la limite sous ce qui est déjà écrit.
  const setQuota = (n) => (state.quota = n)
  return { data, gets, writes, local, setQuota }
}

// Une entrée telle que le cache l'écrit.
export const cached = (at, signals = {}) => ({ at, sig: '', signals })

export const history = (n, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ at: `2026-09-${i + 1}`, price: from + i }))
