# Bibimbap

Bibimbap — is my favorite Korean dish. It is a warm steamed white rice on the bottom of a bowl, and namul (sautéed and seasoned vegetables), gochujang (hot pepper soybean paste), and sesame oil over the rice. You have to mix it well with a spoon just before eating.

<img
  src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Dolsot-bibimbap.jpg/1920px-Dolsot-bibimbap.jpg"
  alt="picture of bibimbap"
  width="200"
  />

A mix of all these ingredients creates an unbelievable taste and consistency. Moreover, a way of serving is very visually appealing. Bibimbap is the best meal. If you have a chance to travel to South Korea, please try it. There should be vegan-friendly options available too.

So, **why I have created this repository**? That's how I decided to call my experimental JavaScript framework. Yes, yet another JavaScript framework, you've heard it right, haha. This repository is my playground for implementing this framework. I'm not sure if I can finish it, because I don't have time to work on my projects, yet I'm going to try, and maybe I can get something useful as an outcome after all.

## Reason for yet another framework

I've been developing stuff using React with redux for more than 4 years now. I love it. With redux-saga, it's even better to experience. I can't say it is a framework. It's just a set of libraries, sometimes you end up with tens of libraries all built by different people with different ideas in mind and different approaches to delivering their solutions, some cover everything with tests and provide testing utilities, some of them not that thorough with automated testing and use help of community to find and fix bugs. So ideally you get a bunch of libraries of your choice which you use from project to project. Sometimes you add something because the project needs it, sometimes there is something new you want to try, but at the end of the day, you have a boilerplate of libs you'd use for your next project. The same works for most of the popular front-end libraries and frameworks, like vue.js, angular, backbone, and other.

That's great, don't get me wrong. I love the idea of high modularity and code reuse. However, sometimes this modularity and flexibility make it difficult to iterate fast. Since everything is a module and built by someone else, you can't be sure that it works as expected and does not break your code. Sometimes you don't have enough control over packages you use; sometimes a lib has too many features so you spend days just on configuring something when your customer can't understand why do you even need this in the first place. Sometimes your customer needs tons of forms and tables, and you don't have a suitable component that would have all of the requested features and still would be testable and stable.

It is good to have tons of libraries when you a VC startup that can afford spending months playing around with libraries, but if you are mere mortal things won't come out that easy for you.

That's why I want an enterprise-grade solution built for full-stack development. I know there are some solutions, but none of them developed to be test-first suitable.

## What I want

- I want an old school monolith Framework, like Django, RoR, Symfony.
- I want it to provide first-class test-first experience out of the box.
- I want it to have visual regression testing.
- I want it to have a static analysis ability.
- I want it to have a large UI library with advanced components, like tables, forms, graphs, and other.
- I want it to provide a back-end solution built using PostgreSQL, like PostgREST or PostGraphQL, but tightly integrated with coding environment and framework's type system.
- I want it to have a CI/CD solution out of the box using k8s.
- I want it to be able to scaffold, like RoR.
- I want it to have an integrated admin solution like Django has.

I want it to have all of these components and features, so I could install them with one command, quickly set up CI and CD, add some data, scaffold it, and have all these covered with tests with test-first style.

A delicious mix of all the great ingredients. It sounds like bibimbap for me.

I believe these requirements are more than real to implement. Also, I have some more if I finish these first.

Like:

- I want it to be offline first.
- I want it to come with an integrated developer environment and cloud-editor.
- I want it to store the code as an AST.
- I want it to run all the code tests, visual regression tests, and integrated tests just for pieces of the product that were changed at the moment and not doing all the plain-text building stuff for every step, so it would be swift and provide the smallest feedback loop possible.
- I want it to have a database editor with migration generation on every change, like if you update a table using some interface and you get a migration of this change automatically so you could easily version your database.
- I want the integrated editor to have a pair and mob programming integration.
- I want to have a marketplace of bibimbap professionals and learning center for them.

I want a new industry haha. Needless to say that I can't do the project of this size on my own. I don't have the money nor have I time. So, I'll be happy achieving at least 10% of these and dreaming about the rest.

Life would be so much more comfortable with bibimbap.

## Auto-exposed back-end right out of the database

I love the idea behind [PostgREST](https://github.com/PostgREST/postgrest). The thing that advanced RDBMS like PostgreSQL, Oracle, or SQL Server has everything to build pretty much-advanced back-end right in the database using stored functions and roles system. PostgREST exposes tables and stored functions as REST endpoints so you can call them in your code just as you do with any other REST API. Also, it is quite secure if you do it right; since, PostgreSQL has advanced roles and privileges system, row-level security, and you can encapsulate security critical tables and functions in unexposed schemes. Moreover, it's much faster than working with a database using some back-end language, because you don't have this messaging overhead when your language of choice request a database. All of your queries execute directly in a database.

REST API's are great, yet they require you to do much boilerplate stuff, especially if you use strictly typed environments, you have to type everything twice both in the database and the code.

I'd like to get rid of this step providing code generation for TypeScript type definitions which I can use in the code. Also, I don't see any reason not to use some sort of DSL similar to SQL. Because SQL is excellent, and if I have it in my app, I have a more powerful tool for data handling. Also, this saves some time when I only need to do some joins filters and don't want to create views in the database for this.

That is how it could look like:

```TypeScript
/**
 * Data namespace is provided in the type definitions file generated right out
 * of the exposed database schema
 */

const ComponentRow = jsql.subQuery(
  jsql.select(
    [
      Data.Component['*'],
      jsql.array(Data.Manufacturer['*'], { as: 'manufacturers' })
    ],
    {
      from: [
        Data.Component,
        jsql.leftOuterJoin(Data.ComponentManufacturer, {
          on: jsql.equals(
            Data.ComponentManufacturer.componentId,
            Data.Component.id
          )
        }),
        jsql.leftOuterJoin(Data.Manufacturer, {
          on: jsql.equals(
            Data.ComponentManufacturer.manufacturerId,
            Data.Manufacturer.id
          )
        })
      ],
      groupBy: [Data.Component.id]
    }
  ),
  { as: 'ComponentRow' }
);

const selectDeviceDetails = (deviceId: ColumnType<typeof Data.Device.id>) =>
  jsql.select([Data.Device, jsql.array(ComponentRow)], {
    from: [
      Data.Device,
      jsql.leftOuterJoin(Data.DeviceComponent, {
        on: jsql.equals(Data.DeviceComponent.deviceId, Data.Device.id)
      }),
      jsql.leftOuterJoin(ComponentRow, {
        on: jsql.equals(ComponentRow.id, Data.DeviceComponent.componentId)
      })
    ],
    groupBy: [Data.Device.id],
    where: jsql.equals(Data.Device.id, deviceId),
    limit: [1]
  });
```

### PostgreMote

PostgreMote exposes several tools:

1. PostgreSQL web interface
2. Migration tool
3. JavaScript, TypeScript, and PgSQL code generation tools
4. Testing and code coverage tool

#### Web interface

PostgreMote comes with a web interface dedicated to PostgreSQL management. The primary goal for this interface is to generate atomic migrations automatically
on each change of the database, so you could free yourself from doing this manually. Also, this UI provides a tool for resolving git conflicts on migrations and collects information about code coverage on each test run so you could see if everything in your SQL code is covered well with your test suite.

#### Code generation

PostgreMote can generate JavaScript and TypeScript glue code that you can use in your app to make queries to the database. It comes handy with TypeScript because it also covers everything with correct types represented in the database.
