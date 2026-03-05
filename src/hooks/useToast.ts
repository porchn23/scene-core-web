import { useState, useCallback } from 'react';

export function useToast() {
    const [t, setT] = useState<{ msg: string; err?: boolean } | null>(null);
    const show = useCallback((msg: string, err = false) => {
        setT({ msg, err });
        setTimeout(() => setT(null), 3500);
    }, []);
    return { t, show };
}
