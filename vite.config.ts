import { defineConfig } from 'vite';

// GitHub Pages serves project sites from /<repo-name>/ — set base automatically in CI.
export default defineConfig(() => ({
  base: process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '/',
}));
