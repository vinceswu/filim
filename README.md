<img align="center" width="1452" height="352" alt="filim_poster_1452x352" src="https://github.com/user-attachments/assets/d6ddeba8-c8ad-4e4d-8b22-c22e46b9b337" />

<p align="center">
  <a href="https://github.com/ecnivs/filim/stargazers">
    <img src="https://img.shields.io/github/stars/ecnivs/filim?style=flat-square">
  </a>
  <a href="https://github.com/ecnivs/filim/issues">
    <img src="https://img.shields.io/github/issues/ecnivs/filim?style=flat-square">
  </a>
  <a href="https://github.com/ecnivs/filim/blob/master/LICENSE">
    <img src="https://img.shields.io/github/license/ecnivs/filim?style=flat-square">
  </a>
  <img src="https://img.shields.io/github/languages/top/ecnivs/filim?style=flat-square">
</p>

## Overview

Filim is a self-hosted **Next.js** frontend and **FastAPI** backend for browsing catalogs and playing streams in your browser (HLS in the client). It is an automation and convenience layer around content that is already published on the public internet: the app requests metadata and stream pointers from independent third-party sources and does not operate as a host or permanent archive of video files. Conceptually it is closer to a specialized browser than to a streaming service that stores or redistributes media.

> [!CAUTION]
> **Use at your own risk.** Whether your use complies with local law and with the terms of any third-party site is entirely your responsibility. The authors do not control what those sources serve and are not responsible for your choice to access particular material.
>
> **Copyright and DMCA:** Claims about infringing material should be directed to the sites or providers that actually host or deliver the content, not to this repository as a substitute. Tools in this space (for example [ani-cli](https://github.com/pystardust/ani-cli)) document that notices for similar integrations may belong with providers such as [allanime.to](https://allanime.to). Please do not use GitHub issues to harass maintainers about third-party media.

## Prerequisites

- Python 3.x (tested with Python 3.13)
- `uv` (Python package manager)
- `Node.js`

## Installation

1. **Clone the repository**

```bash
git clone https://github.com/ecnivs/filim.git
cd filim
```

2. **Install backend dependencies** (from the `backend` folder; this creates a virtual environment and installs the API)

```bash
cd backend
uv sync
```

3. **Install frontend dependencies**

```bash
cd ../frontend
npm install
```

## Running Filim

**Start the API** (leave this terminal open):

```bash
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Start the web app** (use a second terminal):

```bash
cd frontend
npm run dev
```

## Contributing
Feel free to:
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Submit a pull request

#### *I'd appreciate any feedback or code reviews you might have!*
