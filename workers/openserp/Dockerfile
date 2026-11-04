# OpenSERP with our locked-down config. Keep the tag pinned: Google changes its pages, so update on purpose and test.
FROM karust/openserp:0.8.17
COPY config.yaml /usr/src/app/config.yaml
COPY chrome-no-sandbox.sh /usr/local/bin/chrome-no-sandbox
# The base image runs as "chrome", which can't change a copied file's permissions.
USER root
RUN chmod 755 /usr/local/bin/chrome-no-sandbox
USER chrome
ENV OPENSERP_APP_BROWSER_PATH=/usr/local/bin/chrome-no-sandbox
CMD ["serve"]
