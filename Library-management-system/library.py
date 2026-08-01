import requests
from book import Book
class Library:
    def __init__(self):
        self.books=[]
    def search_book(self,query):
        url="https://openlibrary.org/search.json?q="+query
        data=requests.get(url)
        data=data.json()
        self.books.clear()
        for item in data['docs']:
            title=item.get('title','Unknown')
            author=item.get('author_name',['Unknown'])[0]
            new_book=Book(title,author)
            self.books.append(new_book)
    def show_books(self):
        for i, book in enumerate(self.books,start=1):
            print(f"{i}.{book.title} by {book.author}")
          
