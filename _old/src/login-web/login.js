function save_options() {
    let alumne = document.getElementById('alumne').value;
    let clau = document.getElementById('clau').value;

    if(alumne === '' || clau === ''){
        alert("Cal especificar alumne i clau");
        return;
    }

    fetch(window.location.origin + '/login/auth', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            alumne: alumne,
            clau: clau
        })
    }).then((response) => {
        if(response.status === 200){
            alert("Alumne registrat correctament");
                window.close();
        } else if (response.status === 401) {
            alert("Error d'autentificació de l'alumne");
        }
        else {
            alert("Error desconegut");
        }
    })

  }

  document.getElementById('save').addEventListener('click',
      save_options);
