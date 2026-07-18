import { useEffect, useState, useCallback, useRef } from 'react';

// In-memory cache for translations (persists across component re-renders)
const translationCache = new Map<string, Promise<string>>();

interface TranslationOptions {
  targetLanguage?: string;
}

/**
 * Custom hook for efficient translation management
 * - Caches translations to avoid redundant API calls
 * - Returns translations asynchronously without blocking render
 * - Debounces requests if the same text is requested multiple times quickly
 */
export function useTranslation(text: string | null, options: TranslationOptions = {}) {
  const { targetLanguage = 'en' } = options;
  const [translation, setTranslation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track the latest text so retry() can refetch without stale closures
  const textRef = useRef<string | null>(text);
  textRef.current = text;

  const getCacheKey = useCallback((t: string, lang: string) => `${t}|${lang}`, []);

  const fetchTranslation = useCallback(async (textToTranslate: string) => {
    if (!textToTranslate || !textToTranslate.trim()) {
      setTranslation(null);
      setLoading(false);
      return;
    }

    const cacheKey = getCacheKey(textToTranslate, targetLanguage);

    // Check if we already have this translation or a request is in flight
    if (translationCache.has(cacheKey)) {
      setLoading(true);
      try {
        const cachedResult = await translationCache.get(cacheKey)!;
        setTranslation(cachedResult);
        setError(null);
      } catch (err) {
        // Evict the failed promise so a retry can refetch instead of
        // re-awaiting the same rejected result forever.
        translationCache.delete(cacheKey);
        setError(err instanceof Error ? err.message : 'Translation failed');
        setTranslation(null);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Create new request and cache the promise
    setLoading(true);
    setError(null);

    const requestPromise = fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textToTranslate, to: targetLanguage }),
      signal: abortControllerRef.current?.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Translation request failed');
        }
        const data = await response.json();
        return data.translatedText;
      });

    translationCache.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      setTranslation(result);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        // Evict the failed promise so a retry can refetch instead of
        // re-awaiting the same rejected result forever.
        translationCache.delete(cacheKey);
        setError(err.message || 'Translation failed');
        setTranslation(null);
      }
    } finally {
      setLoading(false);
    }
  }, [targetLanguage, getCacheKey]);

  // Manually refetch the current text (used by the UI retry button).
  const retry = useCallback(() => {
    const t = textRef.current;
    if (!t || !t.trim()) return;
    abortControllerRef.current = new AbortController();
    translationCache.delete(getCacheKey(t, targetLanguage));
    setError(null);
    fetchTranslation(t);
  }, [getCacheKey, targetLanguage, fetchTranslation]);

  useEffect(() => {
    // Cancel previous request if component unmounts or text changes
    abortControllerRef.current = new AbortController();

    // Clear translation immediately when text changes (before fetching new one)
    setTranslation(null);
    setError(null);

    if (text) {
      fetchTranslation(text);
    } else {
      setLoading(false);
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [text, targetLanguage, fetchTranslation]);

  return { translation, loading, error, retry };
}

/**
 * Clear the translation cache (useful for testing or when you want to refetch)
 */
export function clearTranslationCache() {
  translationCache.clear();
}
