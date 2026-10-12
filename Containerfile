# The base: Aurora (x86) for the real image. The arm64 test build passes
# BASE_IMAGE=quay.io/fedora-ostree-desktops/kinoite:44 (same Fedora and Plasma)
# so the same recipe can run in a VM on Apple Silicon.
ARG BASE_IMAGE=ghcr.io/ublue-os/aurora:stable@sha256:94b81908b565b2fa1a7c98836570c16f4c6d3e80f4bb1eadb8d497217433ab1d

# The SIOS native apps (apps/*), compiled on the same base as the image so
# their Qt and KDE libraries match exactly. Only the built files are copied
# into the image; the compilers stay in this stage.
FROM ${BASE_IMAGE} AS apps
RUN dnf5 -y install cmake ninja-build gcc-c++ extra-cmake-modules \
      qt6-qtbase-devel qt6-qtdeclarative-devel qt6-qtsvg-devel \
      kf6-kio-devel kf6-kcoreaddons-devel kf6-ki18n-devel kf6-kconfig-devel appstream-qt-devel
COPY apps /apps
RUN for app in /apps/sios-*/; do \
      cmake -S "$app" -B "/build/$(basename "$app")" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/usr -Wno-dev && \
      cmake --build "/build/$(basename "$app")" && \
      DESTDIR=/out cmake --install "/build/$(basename "$app")" || exit 1; \
    done

# Allow build scripts to be referenced without being copied into the final image
FROM scratch AS ctx
COPY build_files /
COPY system_files /system_files
COPY --from=apps /out /apps_out

# Base Image
FROM ${BASE_IMAGE}
## Other possible base images include:
# FROM ghcr.io/ublue-os/bazzite:testing
# FROM ghcr.io/ublue-os/kinoite-main:latest
# FROM ghcr.io/ublue-os/bluefin-nvidia-open:stable
# 
# ... and so on, here are more base images
# Universal Blue Images: https://github.com/orgs/ublue-os/packages
# Fedora base image: quay.io/fedora/fedora-bootc:44
# CentOS base images: quay.io/centos-bootc/centos-bootc:stream10

### [IM]MUTABLE /opt
## Some bootable images, like Fedora, have /opt symlinked to /var/opt, in order to
## make it mutable/writable for users. However, some packages write files to this directory,
## thus its contents might be wiped out when bootc deploys an image, making it troublesome for
## some packages. Eg, google-chrome, docker-desktop.
##
## Uncomment the following line if one desires to make /opt immutable and be able to be used
## by the package manager.

# RUN rm /opt && mkdir /opt

### MODIFICATIONS
## make modifications desired in your image and install packages by modifying the build.sh script
## the following RUN directive does all the things required to run "build.sh" as recommended.

RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=cache,dst=/var/cache \
    --mount=type=cache,dst=/var/log \
    --mount=type=tmpfs,dst=/tmp \
    /ctx/build.sh

### LINTING
## Verify final image and contents are correct.
# strict for the real image; the arm64 test build passes LINT=warn
ARG LINT=strict
RUN bootc container lint || [ "$LINT" = "warn" ]
