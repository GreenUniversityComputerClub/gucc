# Media migration report

Target **local** · 2026-09-26T08:19:34.299Z

|                                   |         |
| --------------------------------- | ------- |
| Legacy files processed            | 268     |
| Moved to R2                       | 267     |
| Duplicates merged                 | 0       |
| Left as static assets             | 1       |
| R2 objects written (all variants) | 727     |
| Size of originals                 | 42.7 MB |
| Size in R2 (all variants)         | 43.5 MB |

Images were re-encoded to WebP with orientation applied and all metadata (EXIF, GPS, XMP) removed. Nothing was upscaled; alpha channels are preserved.

## Left as static assets

- `/certificates/hacktheai-template.svg` — SVG stays a static asset (vector logos can carry scripts; not served from R2)
