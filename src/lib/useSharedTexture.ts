import { useEffect, useState } from 'react'
import { TextureLoader, type Texture } from 'three'

type TextureEntry = {
  error: Error | null
  listeners: Set<() => void>
  loading: boolean
  texture: Texture | null
}

type SharedTextureState = {
  error: Error | null
  loading: boolean
  texture: Texture | null
}

const loader = new TextureLoader()
const cache = new Map<string, TextureEntry>()
const preparedTextures = new WeakMap<Texture, Set<string>>()

function snapshot(entry: TextureEntry): SharedTextureState {
  return {
    texture: entry.texture,
    error: entry.error,
    loading: entry.loading,
  }
}

function notify(entry: TextureEntry) {
  for (const listener of entry.listeners) {
    listener()
  }
}

function getOrCreateEntry(
  cacheKey: string,
  url: string,
  prepareKey?: string,
  prepare?: (texture: Texture) => void,
): TextureEntry {
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const entry: TextureEntry = {
    texture: null,
    error: null,
    loading: true,
    listeners: new Set(),
  }

  cache.set(cacheKey, entry)

  loader.load(
    url,
    (texture) => {
      if (prepareKey && prepare) {
        prepareTexture(texture, prepareKey, prepare)
      }
      entry.texture = texture
      entry.loading = false
      notify(entry)
    },
    undefined,
    (error) => {
      entry.error = error instanceof Error
        ? error
        : new Error(`Failed to load texture: ${url}`)
      entry.loading = false
      notify(entry)
    },
  )

  return entry
}

export function useSharedTexture(url: string): SharedTextureState {
  return useTextureState(url, url)
}

export function usePreparedSharedTexture(
  url: string,
  key: string,
  prepare: (texture: Texture) => void,
): SharedTextureState {
  return useTextureState(`${url}::${key}`, url, key, prepare)
}

function useTextureState(
  cacheKey: string,
  url: string,
  prepareKey?: string,
  prepare?: (texture: Texture) => void,
): SharedTextureState {
  const [state, setState] = useState<SharedTextureState>(() => (
    snapshot(getOrCreateEntry(cacheKey, url, prepareKey, prepare))
  ))

  useEffect(() => {
    const entry = getOrCreateEntry(cacheKey, url, prepareKey, prepare)
    const update = () => setState(snapshot(entry))

    entry.listeners.add(update)
    update()

    return () => {
      entry.listeners.delete(update)
    }
  }, [cacheKey, url, prepareKey, prepare])

  return state
}

export function prepareTexture(
  texture: Texture,
  key: string,
  prepare: (texture: Texture) => void,
) {
  const preparedKeys = preparedTextures.get(texture)
  if (preparedKeys?.has(key)) return

  prepare(texture)

  if (preparedKeys) {
    preparedKeys.add(key)
    return
  }

  preparedTextures.set(texture, new Set([key]))
}
