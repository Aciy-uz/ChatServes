const pool = require('./src/db');


(async () => {


    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [1]); 

    console.log(rows);
})();
