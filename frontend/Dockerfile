# frontend/Dockerfile
# Multi-stage: Build with Node.js, Serve with Nginx

# # Build stage - Use regular node image with proper npm handling
# FROM node:18 as build
# WORKDIR /app

# # Copy package files
# COPY package*.json ./

# # Fix the npm optional dependencies issue
# RUN npm cache clean --force
# RUN rm -rf node_modules package-lock.json
# RUN npm install --force
# RUN npm install @rollup/rollup-linux-x64-gnu --save-optional

# # Copy source code
# COPY . .

# # Build the Vite application
# RUN npm run build

# Production stage
# FROM nginx:alpine

# # Install curl for health checks
# RUN apk add --no-cache curl

# # Copy nginx configuration
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# # Copy built application from build stage
# COPY --from=build /app/dist /usr/share/nginx/html

# # Copy favicon
# COPY public/vite.svg /usr/share/nginx/html/

# # Set permissions
# RUN chown -R nginx:nginx /usr/share/nginx/html && \
#     chmod -R 755 /usr/share/nginx/html

# # Expose port
# EXPOSE 80

# # Health check
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#     CMD curl -f http://localhost/ || exit 1

# # Start nginx
# CMD ["nginx", "-g", "daemon off;"]

# Simple approach: Build locally, Docker just serves with Nginx

FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy pre-built dist folder (built locally)
COPY dist /usr/share/nginx/html

# Copy favicon
COPY dist/vite.svg /usr/share/nginx/html/

# Set permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
