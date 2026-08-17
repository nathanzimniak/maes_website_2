# MAES website

Website for visualizing Magnetized Accretion-Ejection Structures (MAES) solutions.

Scientific datasets are loaded from the public Cloudflare R2 bucket configured by
`scientificDataBaseUrl` in `app.js`.

Every entry in `datasetDirectories` must have been uploaded below the bucket's
`data/` prefix. The R2 bucket must also allow cross-origin `GET` requests from the
website origin. For example, its CORS policy can contain:

```json
[
  {
    "AllowedOrigins": ["https://example.com"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": [],
    "ExposeHeaders": ["Content-Length", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace `https://example.com` with the website's exact origin. A missing R2 object
returns `404`; that error response can also appear in the browser as a missing
`Access-Control-Allow-Origin` header.
