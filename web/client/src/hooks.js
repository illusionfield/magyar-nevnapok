import { useCallback, useEffect, useRef, useState } from "react";

export function useRoute() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return pathname;
}

export function createQuerySequence() {
  let current = 0;

  return {
    begin() {
      current += 1;
      return current;
    },
    isCurrent(sequence) {
      return sequence === current;
    },
  };
}

export function useWsQuery(loader, deps = [], options = {}) {
  const enabled = options.enabled ?? true;
  const keepPreviousData = options.keepPreviousData ?? true;
  const [state, setState] = useState({
    loading: enabled,
    error: null,
    data: null,
  });
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  const querySequenceRef = useRef(createQuerySequence());

  loaderRef.current = loader;

  const refresh = useCallback(() => {
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState((current) => {
        const nextState = {
          loading: false,
          error: null,
          data: keepPreviousData ? current.data : null,
        };

        if (
          current.loading === nextState.loading &&
          current.error === nextState.error &&
          current.data === nextState.data
        ) {
          return current;
        }

        return nextState;
      });
      return undefined;
    }

    let cancelled = false;
    const sequence = querySequenceRef.current.begin();

    setState((current) => ({
      loading: true,
      error: null,
      data: keepPreviousData ? current.data : null,
    }));

    Promise.resolve()
      .then(() => loaderRef.current())
      .then((data) => {
        if (cancelled || !querySequenceRef.current.isCurrent(sequence)) {
          return;
        }

        setState({
          loading: false,
          error: null,
          data,
        });
      })
      .catch((error) => {
        if (cancelled || !querySequenceRef.current.isCurrent(sequence)) {
          return;
        }

        setState((current) => ({
          loading: false,
          error: error.message,
          data: keepPreviousData ? current.data : null,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, keepPreviousData, nonce, ...deps]);

  return {
    ...state,
    refresh,
  };
}
