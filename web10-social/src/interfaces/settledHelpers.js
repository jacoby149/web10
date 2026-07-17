const onlySettled = promises => Promise.allSettled(promises)
    .then((results) => {
        return results.filter(p => p.status === "fulfilled")
            .map(p => p.value)
    })

const sortSettled = function (responseDatas,key="time",direction=1) {
    const flatResponseDatas = responseDatas.flat();
    const timeSortedData = flatResponseDatas
        .sort((a, b) => {
            const [timeA, timeB] = [new Date(a[key]), new Date(b[key])]
            return timeB > timeA ? 1*direction : -1*direction
        })
    return timeSortedData;
}

// IDEA, the web10 data manager. to handle Decentralized pagination.
//TODO add a pagination helper, with a react state for the
// PROBLEM - pages of data from different sources. want to pull it in a sorted order.
// SOLUTION - 
// pull n*x entries from n sources. 
// sort into 1 big source.
// when the xth datapoint of a source is reached, request another page.
// do so with a built in web10 function.

export {onlySettled,sortSettled};