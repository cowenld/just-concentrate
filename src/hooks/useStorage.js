import { useState, useEffect, useRef } from 'preact/hooks';
import { getData } from '../lib/storage.js';

export function useStorage(selector) {
  const [value, setValue] = useState(null);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  useEffect(() => {
    getData().then(data => setValue(selectorRef.current(data)));

    const listener = (changes) => {
      if (changes.justConcentrate && changes.justConcentrate.newValue) {
        setValue(selectorRef.current(changes.justConcentrate.newValue));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return value;
}

export function useStorageData() {
  return useStorage(d => d);
}
