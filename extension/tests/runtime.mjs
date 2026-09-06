import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const src = (f) => join(here, '../src/', f)
const load = (f) => (delete require.cache[require.resolve(src(f))], require(src(f)))

// Le service worker vu du content script. Deux messages lui parviennent : la
// lecture du cache, à laquelle ce faux répond seul depuis `cache`, et la
// synchronisation, dont `answer` décide. `calls` ne retient que la seconde —
// c'est elle qui touche le réseau.
export const runtime = (answer, cache = {}) => {
  const calls = []
  const asked = []
  globalThis.ADS = undefined
  globalThis.chrome = {
    runtime: {
      id: 'adscope',
      lastError: null,
      sendMessage(msg, respond) {
        if (msg.type === 'cached') {
          asked.push(msg)
          const hits = msg.ids.filter((id) => id in cache).map((id) => [id, cache[id]])
          return respond({ ok: true, signals: Object.fromEntries(hits) })
        }
        calls.push(msg)
        answer(respond, globalThis.chrome.runtime, msg)
      },
    },
  }
  load('context.js')
  return { sync: load('sync.js'), calls, asked }
}
