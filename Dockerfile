FROM caddy:2.8-alpine

# Static site content
WORKDIR /srv
COPY . /srv
COPY Caddyfile /etc/caddy/Caddyfile

# Northflank/Koyeb can inject PORT; default is 8080
EXPOSE 8080
