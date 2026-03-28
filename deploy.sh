#!/bin/bash

# 跳过TypeScript检查直接构建
vite build --no-check

# 部署到GitHub Pages
gh-pages -d dist