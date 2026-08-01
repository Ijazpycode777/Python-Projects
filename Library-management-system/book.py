import requests
class Book:
    def __init__(self,title,author):
        self.title=title
        self.author=author
        self.available=True
    def show(self):
        print(f"Title: {self.title}")
        print(f"Author: {self.author}")
    def return_book(self):
        self.available=True
        print(f"You returned {self.title}.")
    def borrow(self):
        if self.available:
            self.available=False
        else:
            print("Book is already borrowed!")
        
          
