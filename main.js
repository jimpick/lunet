export const main = async () => {
  document.body.textContent = "Installing a service worker"
  try {
    const serviceURL = new URL("./service.js", import.meta.url)
    const registration = await navigator.serviceWorker.register(serviceURL, {
      scope: new URL(location).pathname
    })
    document.body.textContent = `Service worker registred ${registration}`
    registration.update()
    document.body.textContent = `Service worker updated`
  } catch (error) {
    document.body.textContent = `Service worker registration failed ${error}`
  }
}

main()