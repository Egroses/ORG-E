# Third-party notice

`imaging/tanwcs.py` is adapted from the `backend/spx/tanwcs.py` module of
[YosefGul/spherex-blink](https://github.com/YosefGul/spherex-blink) (pure-numpy TAN-SIP WCS,
`clipped_mean_stack`, `clipped_median`, `mad_std`). The epoch splitting and the
sigma-clipped-mean stacking idea in `imaging/core.py` follow `spx/stack.py` of the same project.
The code was reimplemented or copied with the logic unchanged; the original licence follows.

```
MIT License

Copyright (c) 2026 SPHEREx Blink contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
