# Media migration report

Target **production** · 2026-09-27T16:44:39.891Z

|                                   |        |
| --------------------------------- | ------ |
| Legacy files processed            | 1      |
| Moved to R2                       | 0      |
| Duplicates merged                 | 0      |
| Left as static assets             | 1      |
| R2 objects written (all variants) | 0      |
| Size of originals                 | 1.3 MB |
| Size in R2 (all variants)         | 0.0 MB |

Images were re-encoded to WebP with orientation applied and all metadata (EXIF, GPS, XMP) removed. Nothing was upscaled; alpha channels are preserved.

## Left as static assets

- `/certificates/hacktheai-template.svg` — SVG stays a static asset (vector logos can carry scripts; not served from R2)
