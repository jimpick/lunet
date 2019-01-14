// @flow strict

const VERSION = "0.0.2"
const daemonURL = new URL("https://127.0.0.1:9000")

const install = (event /*:InstallEvent*/) => {
  console.log(`Service installed at ${self.registration.scope}`)
  // Cache all the assets that we may need so they can be served offline.
  event.waitUntil(setup())
}

const activate = (event /*:ExtendableEvent*/) => {
  console.log(`Service activated at ${self.registration.scope}`)
  // At the moment we claim all the clients. In the future we should
  // consider how do we deal with SW updates when former one already has
  // clients.
  event.waitUntil(initialize())
}

const request = (event /*:FetchEvent*/) => {
  console.log(`Service request ${event.request.url}`)
  const response = respond(event)
  event.respondWith(response)
}

const respond = async event => {
  const url = new URL(event.request.url)
  switch (url.origin) {
    case self.origin: {
      const response = await localFetch(event)
      console.log(`Service response`, response)
      return response
    }
    default:
      const response = await foreignFetch(event)
      console.log(`Service response`, response)
      return response
  }
}

const localFetch = async event => {
  const cache = await caches.open(VERSION)
  const response = await cache.match(event.request)
  if (response) {
    return response
  } else {
    return serviceFetch(event)
  }
}

const foreignFetch = event => {
  const url = new URL(event.request.url)
  // At the moment firefox blocks requests to all http from the SW but it does
  // not from the document context. To workaroud that we funnel local requests
  // through our serice.
  switch (url.hostname) {
    case "127.0.0.1":
      return serviceFetch(event)
    default:
      return fetch(event.request)
  }
}

// This just routes requests to local systray app. In practice we would want to
// try bunch of different ways to get the content instead.
const serviceFetch = async ({ request }) => {
  try {
    const localURL = new URL(request.url)
    const foreignURL = updateHost(localURL, daemonURL)
    console.log(`Daemon request ${foreignURL.href}`)

    const requestHeaders = new Headers(request.headers)
    requestHeaders.delete("upgrade-insecure-requests")
    requestHeaders.delete("origin")
    requestHeaders.delete("dnt")
    requestHeaders.delete("accept")
    requestHeaders.delete("user-agent")
    requestHeaders.delete("x-requested-with")

    const body = await encodeBody(request)

    const response = await fetch(foreignURL, {
      method: request.method,
      headers: requestHeaders,
      body
    })
    const headers = new Headers(response.headers.entries())

    if (response.url !== foreignURL.href) {
      const location = updateHost(new URL(response.url), localURL)
      headers.set("location", location.href)
      return new Response(response.body, {
        status: 302,
        headers
      })
    } else {
      return new Response(response.body, {
        status: response.status,
        headers
      })
    }
  } catch (error) {
    return new Response(error.toString(), {
      status: 500
    })
  }
}

const setup = async () => {
  console.log("Service Skip Waiting")
  await self.skipWaiting()

  const cache = await caches.open(VERSION)
  await cache.addAll([
    "./",
    "./lunet/host.js",
    "./lunet/client.js",
    "./lunet/proxy.js"
  ])
}

const initialize = async () => {
  console.log(`Initializing service`)
  const clients = await self.clients.matchAll({ includeUncontrolled: true })
  console.log(`Service worker claiming clients ${clients.map($ => $.url)}`)

  await self.clients.claim()

  const versions = await caches.keys()
  for (const version of versions) {
    if (version !== VERSION) {
      console.log(`Service worker is clearing obsolete cache`)
      await caches.delete(version)
    }
  }
}

const encodeBody = (request /*:Request*/) => {
  switch (request.method) {
    case "GET":
    case "HEAD":
      return null
    default:
      return request.arrayBuffer()
  }
}

const updateHost = (url, hostURL) =>
  new URL(`${url.pathname}${url.search}`, hostURL)

self.addEventListener("install", install)
self.addEventListener("activate", activate)
self.addEventListener("fetch", request)
