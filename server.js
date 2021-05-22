require('isomorphic-fetch')
const dotenv = require('dotenv')
const Koa = require('koa')
const KoaRouter = require('koa-router')
const next = require('next')
const { default: createShopifyAuth } = require('@shopify/koa-shopify-auth')
const { verifyRequest } = require('@shopify/koa-shopify-auth')
const session = require('koa-session')
const koaBody = require('koa-body')
const { receiveWebhook } = require('@shopify/koa-shopify-webhooks')
const { registerWebhook } = require('@shopify/koa-shopify-webhooks')
const cors = require('@koa/cors')

const MongoClient = require('mongodb').MongoClient

dotenv.config()
const { default: graphQLProxy } = require('@shopify/koa-shopify-graphql-proxy')
const { ApiVersion } = require('@shopify/koa-shopify-graphql-proxy')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const {
  SHOPIFY_API_SECRET_KEY,
  SHOPIFY_API_KEY,
  APP_URl,
  DB_HOST,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
} = process.env

const server = new Koa()
const router = new KoaRouter()

server.use(cors({ origin: '*' }))

var products = []

// Fetch store products
router.get('/api/fetchProduct', async (ctx) => {
  const { shop, accessToken } = ctx.session

  if (shop && accessToken) {
    const productUrl = `https://${shop}/admin/api/2020-04/products.json?presentment_currencies=USD`
    const productResponse = await fetch(productUrl, {
      method: 'get',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    })

    const productResponseBody = await productResponse.json()
    // console.log('Store details', productResponseBody);
    try {
      ctx.body = {
        status: 'success',
        data: products,
      }
    } catch (error) {
      console.log(error)
    }
  } else {
    ctx.body = {
      status: 500,
      message: 'Invalid access',
    }
  }
})

// Get Shop products for store front
router.get('/api/products', koaBody(), async (ctx) => {
  // try {
  //   ctx.body = {
  //     status: 'success',
  //     data: products,
  //   }
  // } catch (error) {
  //   console.log(error)
  // }

  const query = ctx.request.query
  if (query.shop) {
    const products = await product.find({ domain: query.shop }).toArray()
    ctx.body = {
      status: 'success',
      data: products,
    }
  } else {
    ctx.body = {
      status: 500,
      message: 'Shop is required',
    }
  }
})

// Save shop products in database
router.post('/api/products', koaBody(), async (ctx) => {
  try {
    const body = ctx.request.body
    const { shop, accessToken } = ctx.session

    // Check product exists in db
    await product.findOne(
      { domain: shop, id: body.id },
      async (error, result) => {
        if (error) {
          ctx.body = {
            status: 500,
            error: error,
          }
        }
        if (!result) {
          // Insert data in product table
          body.domain = shop
          await product.insertOne(body, (error, result) => {
            if (error) {
              console.log('error1', error)
            } else {
              console.log('Product added in db')
            }
          })
        } else {
          console.log('Product already exists in db')
        }
      }
    )

    await products.push(body)
    ctx.body = 'Item Added'
  } catch (error) {
    console.log(error)
  }
})

// Delete products of shop from databsase
router.delete('/api/products', koaBody(), async (ctx) => {
  // try {
  //   products = []
  //   ctx.body = 'All items deleted!'
  // } catch (error) {
  //   console.log(error)
  // }
  const { shop, accessToken } = ctx.session
  try {
    products = []
    await product.deleteMany({ domain: shop })
    ctx.body = 'All items deleted!'
  } catch (error) {
    console.log(error)
  }
})

// Receive weebbhook
const webhook = receiveWebhook({ secret: SHOPIFY_API_SECRET_KEY })

// App unistall weebhook
router.post('/uninstall', webhook, (ctx) => {
  // console.log('received webhook: ', ctx.state.webhook);
  // console.log('received webhook: ', ctx.request.body);
  const shop = ctx.request.body.domain
  if (shop) {
    store.deleteOne({ domain: shop })
    product.deleteMany({ domain: shop })
    console.log(shop)
    console.log('shop data deleted')
  }
})

// Database connection
const uri =
  'mongodb+srv://' +
  DB_USER +
  ':' +
  DB_PASSWORD +
  '@' +
  DB_HOST +
  '/' +
  DB_NAME +
  '?retryWrites=true&w=majority'
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

// Router Middleware
server.use(router.allowedMethods())
server.use(router.routes())

app.prepare().then(() => {
  // server.use(session(server))
  server.use(session({ sameSite: 'none', secure: true }, server))
  server.keys = [SHOPIFY_API_SECRET_KEY]
  server.use(
    createShopifyAuth({
      apiKey: SHOPIFY_API_KEY,
      secret: SHOPIFY_API_SECRET_KEY,
      scopes: [
        'read_products',
        'write_products',
        'read_script_tags',
        'write_script_tags',
      ],
      async afterAuth(ctx) {
        const { shop, accessToken } = ctx.session
        console.log(shop)
        // Check store exists in db
        await store.findOne({ domain: shop }, async (error, result) => {
          if (error) {
            ctx.body = {
              status: 500,
              error: error,
            }
          }
          if (!result) {
            // Register a webhook for app uninstall
            const registration = await registerWebhook({
              // for local dev you probably want ngrok or something similar
              address: `${APP_URl}/uninstall`,
              topic: 'APP_UNINSTALLED',
              format: 'json',
              accessToken,
              shop,
              apiVersion: ApiVersion.Unstable,
            })

            if (registration.success) {
              console.log('Successfully registered webhook!')

              // Register script tag
              const scriptTagJsonUrl = `https://${shop}/admin/api/2019-10/script_tags.json`
              const response = await fetch(scriptTagJsonUrl, {
                method: 'post',
                headers: {
                  'X-Shopify-Access-Token': accessToken,
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  script_tag: {
                    event: 'onload',
                    src: `${APP_URl}/custom.js`,
                  },
                }),
              })

              // const responseBody = await response.json();
              // console.log(responseBody, `=====responseBody in create st=====`);

              // Insert data in store table
              const storeresponse = {
                domain: shop,
                accessToken: accessToken,
              }
              await store.insertOne(storeresponse, (error, result) => {
                if (error) {
                  console.log('error1', error)
                } else {
                  console.log('store detail inserted into db')
                }
              })
            } else {
              console.log('Failed to register webhook', registration.result)
            }
          } else {
            console.log('store detail already exsit in db')
          }
        })

        ctx.cookies.set('shopOrigin', shop, {
          httpOnly: false,
          secure: true,
          sameSite: 'none',
        })
        ctx.redirect('/')
      },
    })
  )

  server.use(graphQLProxy({ version: ApiVersion.October19 }))
  server.use(verifyRequest())

  server.use(async (ctx) => {
    await handle(ctx.req, ctx.res)
    ctx.respond = false
    ctx.res.statusCode = 200
    return
  })

  // ローカル
  // server.listen(port, () => {
  //   console.log(`> Ready on http://localhost:${port}`)
  // })

  // MongoDB
  server.listen(port, () => {
    client.connect((err) => {
      if (err) {
        console.log('Error in database connection ' + err)
        throw err
      }
      global.store = client.db(DB_NAME).collection('stores')
      global.product = client.db(DB_NAME).collection('products')
      console.log('Connected with db')
      console.log(`> Ready on http://localhost:${port}`)
    })
  })
})
