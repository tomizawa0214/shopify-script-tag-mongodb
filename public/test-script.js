const APP_URl = 'https://shopifytopapp.herokuapp.com'

const script = document.createElement('script')
script.src = 'https://code.jquery.com/jquery-3.4.1.min.js'
script.type = 'text/javascript'
script.onreadystatechange = handler
script.onload = handler
document.getElementsByTagName('head')[0].appendChild(script)

function handler() {
  const body = $('body')

  body.css({
    position: 'relative',
  })

  const shop = Shopify.shop

  const makeApp = (products) => {
    const bestSellerContainer = $(
      `<div style="overflow-y: scroll;">
            <h3>売上トップ</h3>
            ${products
              .map((item) => {
                return `
                <a href="/products/${item.handle}" style="display: flex; align-items: center; padding: 20px 10px; border-top: 1px solid black;">
                    <img src=${item.images[0].originalSrc} style="width: 75px;" />
                    <div style="display: flex; justify-content: space-between; align-items: start; width: 100%;">
                        <p style="padding: 0 10px;">${item.title}</p>
                        <p>${item.variants[0].price}</p>
                    </div>
                </a>
                `
              })
              .join('')}
        </div>`
    ).css({
      position: 'fixed',
      'background-color': '#ffffff',
      padding: '10px',
      border: '1px solid black',
      bottom: '80px',
      right: '25px',
      height: '400px',
      width: '400px',
      display: 'none',
      'z-index': 99
    })

    const bestSellerButton = $('<img />')
      .attr('src', `${APP_URl}/top.png`)
      .css({
        position: 'fixed',
        width: '150px',
        bottom: '20px',
        right: '20px',
        cursor: 'pointer',
      })

    body.append(bestSellerButton)
    body.append(bestSellerContainer)

    bestSellerButton.click(() => {
      bestSellerContainer.slideToggle()
    })
  }

  // fetch(APP_URl + '/api/products?shop=' + shop)
  fetch(
    `https://cors-anywhere.herokuapp.com/${APP_URl}/api/products?shop=${shop}`
  )
    .then((res) => res.json())
    .then((data) => {
      makeApp(data.data)
      console.log(data)
    })
    .catch((error) => console.log(error))
}
