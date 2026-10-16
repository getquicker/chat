 || "User";
  if ($("detailsUsername")) $("detailsUsername").textContent = chat.otherUsername ? "@" + chat.otherUsername : "";
  if ($("contactDetailsDialog")) $("contactDetailsDialog").showModal();
}


boot();
