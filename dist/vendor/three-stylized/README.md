# three-stylized GrassLayer

Vendored from https://github.com/Steve245270533/three-stylized at 8eb0dde5a8e7eae985d69f923b627b0cf253bed5. MIT copyright 2026 Steve245270533; see LICENSE. Upstream acknowledges inspiration/adaptation from https://github.com/cortiz2894/stylized-components.

Only GrassLayer and its coverage/surfaceSampler/shader/utils dependencies are used. TS source retained in scripts/vendor/three-stylized/; regenerate native ESM via node --no-warnings scripts/build-three-stylized.mjs. Relative imports gain .js extensions. No external runtime service or downloaded image textures. Application parameters and explicit no-shadow shader defines live in dist/xinyi-short-grass.js.
