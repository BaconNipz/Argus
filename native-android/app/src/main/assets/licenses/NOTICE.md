# Argus offline wake dependencies

Argus bundles the following unmodified upstream runtime and model files. Its wake controller, model selection and keyword configuration are Argus integration code.

- sherpa-onnx 1.13.8, k2-fsa and contributors: Apache License 2.0 (`Apache-2.0.txt`). Source and release: https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.8
- English GigaSpeech keyword-spotting Zipformer 3.3M, 2024-01-01, pkufool / sherpa contributors: Apache License 2.0 as declared in the original `wake-model/MODEL-README.md`. Distribution: https://github.com/k2-fsa/sherpa-onnx/releases/tag/kws-models
- ONNX Runtime, Microsoft Corporation and contributors, statically linked by the sherpa Android distribution: MIT (`ONNX-Runtime-MIT.txt`). Source: https://github.com/microsoft/onnxruntime

The exact downloads, SHA-256 digests and packaged model asset digests are recorded in `wake-model/model-info.json`. The model's encoder and joiner use the upstream int8 files; the decoder uses the upstream floating-point file. Argus supplies a single custom tokenised phrase, “Hey Argus”.
