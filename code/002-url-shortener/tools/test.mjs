
Array.from({ length: 10 }, async () => {
    console.log('a')
    await new Promise((res, rej) => {
        setTimeout(res, 3000)
    })
})