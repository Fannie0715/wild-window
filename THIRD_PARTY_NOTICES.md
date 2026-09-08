# Third-party content

Wild Window's original application code is MIT-licensed. Third-party software retains its own license; see each dependency's package and license files.

Live streams and linked preview images belong to their source publishers and are **not** covered by this repository's MIT license. This repository does not redistribute downloaded streams or video recordings. Documentation screenshots show the application with source-attributed wildlife imagery; those embedded images retain the original publishers’ rights. It embeds official public YouTube players and links publisher-hosted reference images with visible attribution.

- Camelthorn: [Africam](https://africam.com/lodge/camelthorn/) — official embed `mk02pEy3FdA`; the linked elephant preview is a source-site highlight still, not a live frame.
- Royal Albatross: [Cornell Lab Bird Cams](https://www.allaboutbirds.org/cams/royal-albatross/) — official embed `Mm_zVDDUeNA`; the linked preview is Cornell's source-page image, not a live frame.

- Chengdu Giant Panda: [iPanda official YouTube](https://www.youtube.com/watch?v=SUXPnIEpbn4) — official embed `SUXPnIEpbn4`; preview is the official video thumbnail.
- Cornell FeederWatch: [Cornell Lab](https://www.allaboutbirds.org/cams/cornell-lab-feederwatch/) — official embed `x10vL6_47Dw`.
- Panama Fruit Feeders: [Cornell Lab / Canopy Lodge](https://www.allaboutbirds.org/cams/panama-fruit-feeders/) — official embed `WtoxxHADnGk`.
- Panama Hummingbirds: [Cornell Lab / Canopy Tower](https://www.allaboutbirds.org/cams/panama-hummingbird-feeders/) — official embed `0xFARCdZ3vA`.
- Hellgate Ospreys: [Cornell Lab](https://www.allaboutbirds.org/cams/hellgate-ospreys/) — official embed `-qvYCbvbeN8`.

- Tembe Elephant Park: [Africam](https://africam.com/lodge/tembe-elephant-park/) — official embed `gdrNUUf-cQw`; preview is the source-page reference image.
- Stony Point Penguins: [Africam](https://africam.com/lodge/penguins/) — official embed `NiwrvhQIHIo`; preview is the source-page reference image.

Cornell preview photographs are linked from their respective source pages and are not live frames.

Checked 2026-09-07. The project does not grant rights to reuse these publishers' imagery, bypass geographic restrictions, remove branding, or redistribute their streams. Add new channels only through sources that permit third-party embedding.

Bundled UI primitives are based on shadcn/ui (MIT) and Base UI (MIT); Lucide icons are ISC-licensed. Dependency license texts are distributed through their npm packages.

Local image recognition uses [Qwen3-VL-4B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct) (Apache-2.0) through [Ollama](https://github.com/ollama/ollama) (MIT, with separately licensed components). The setup script downloads the official runtime and model on the user's computer. Runtime binaries and model weights are not redistributed in this repository or desktop ZIP. See the upstream projects for their full license texts and model information.

The desktop window uses [Electron](https://github.com/electron/electron) (MIT, with Chromium and other separately licensed components). The launcher downloads the official platform runtime through the pinned npm package. Electron runtime licenses are included in that downloaded distribution; its binaries are not included in this repository or bootstrap ZIP.

`docs/images/monitor-overview.jpg` and `docs/images/mini-window.jpg` are application screenshots showing the Cornell Lab FeederWatch preview. They are included only to demonstrate the interface, are not live feeds, and do not place the underlying photograph under this project’s MIT license.
