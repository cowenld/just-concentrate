import { useState, useCallback } from 'preact/hooks';

export function useMessage() {
  const [loading, setLoading] = useState(false);

  const send = useCallback((type, payload = {}) => {
    setLoading(true);
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, ...payload }, (resp) => {
        setLoading(false);
        resolve(resp);
      });
    });
  }, []);

  return { send, loading };
}

export function sendMessage(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (resp) => {
      resolve(resp);
    });
  });
}
