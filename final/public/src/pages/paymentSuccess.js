const tx_ref = new URLSearchParams(location.search).get("tx_ref");

fetch(`/api/order/${tx_ref}`)
  .then(res => res.json())
  .then(order => {
    // render receipt
  });
