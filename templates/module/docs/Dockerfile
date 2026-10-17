# All Python documentation tooling lives in this image; nothing is installed on the host.
FROM python:3.14.8-slim

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    # The container usually runs as the host user (see compose.yaml), who has no home directory in the image.
    HOME=/tmp

RUN apt-get update \
    && apt-get install --yes --no-install-recommends make \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --requirement /tmp/requirements.txt

WORKDIR /docs
EXPOSE 8000

CMD ["make", "html"]
