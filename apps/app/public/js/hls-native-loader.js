// hls.js 原生取流 loader：通过 Tauri 命令绕过 WebView CORS
(function (root) {
    'use strict';

    function getInvoke() {
        if (typeof tauriConstants !== 'undefined' && tauriConstants.invoke) return tauriConstants.invoke;
        if (root.__TAURI_INTERNALS__ && typeof root.__TAURI_INTERNALS__.invoke === 'function') {
            return root.__TAURI_INTERNALS__.invoke;
        }
        return null;
    }

    function toArrayBuffer(value) {
        if (!value) return new ArrayBuffer(0);
        if (value instanceof ArrayBuffer) return value;
        if (value.buffer instanceof ArrayBuffer) {
            return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        }
        return new Uint8Array(value).buffer;
    }

    class TauriHlsLoader extends Hls.DefaultConfig.loader {
        load(context, config, callbacks) {
            const invoke = getInvoke();
            if (!invoke) {
                super.load(context, config, callbacks);
                return;
            }
            this.context = context;
            this.callbacks = callbacks;
            this.stats = {
                aborted: false,
                loaded: 0,
                total: 0,
                retry: 0,
                trequest: performance.now(),
                tfirst: 0,
                tload: 0,
                retryDelay: 0,
            };
            const stats = this.stats;
            const isPlaylist = !context.frag && !context.keyInfo
                && (context.type === 'manifest' || context.type === 'level'
                    || context.type === 'audioTrack' || context.type === 'subtitleTrack');

            const done = (data) => {
                if (stats.aborted) return;
                stats.tfirst = performance.now();
                stats.tload = performance.now();
                stats.loaded = typeof data === 'string' ? data.length : data.byteLength;
                stats.total = stats.loaded;
                callbacks.onSuccess({ url: context.url, data: data }, stats, context, null);
            };
            const fail = (err) => {
                if (stats.aborted) return;
                const text = err && err.message ? err.message : String(err);
                callbacks.onError({ code: 0, text: text }, context, null, stats);
            };

            try {
                if (isPlaylist) {
                    invoke('fetch_text_native', { url: context.url }).then(done).catch(fail);
                } else {
                    invoke('fetch_bytes_native', { url: context.url })
                        .then((buf) => done(toArrayBuffer(buf)))
                        .catch(fail);
                }
            } catch (e) {
                fail(e);
            }
        }

        abort() {
            if (this.stats) this.stats.aborted = true;
        }

        destroy() {
            if (this.stats) this.stats.aborted = true;
        }
    }

    root.TauriHlsLoader = TauriHlsLoader;
})(typeof globalThis !== 'undefined' ? globalThis : this);
