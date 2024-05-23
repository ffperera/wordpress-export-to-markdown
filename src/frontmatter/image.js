// get cover image filename, previously decoded and set on post.meta
// this one is unique as it relies on special logic executed by the parser
module.exports = (post) => {

    console.dir(post.meta, { depth: null });
    if (post.meta) {
        if (post.meta.guid) {

            console.log('\n ===========================================================\n');

            if (post.meta.guid[0]) {
                console.log(post.meta.guid[0]);
                console.log('\n ===========================================================\n');

            }
        }
    }

    // console.log('\nEND POST DATA DUMP =============================================================\n');
    // return post.meta.guid.replace('http://quecamaraevil.com', '');
    //
    return '___IMAGE___';

};
